package com.oz10.stropping;

import android.content.Intent;
import android.os.BaseBundle;
import android.support.v7.app.AppCompatActivity;

import android.os.Bundle;
import android.support.annotation.IdRes;
import android.support.design.widget.FloatingActionButton;
import android.support.v4.app.Fragment;
import android.support.v7.widget.Toolbar;
import android.view.View;
import android.view.Menu;
import android.view.MenuItem;

import com.adapters.IngredientListAdapter;
import com.adapters.RecipeListAdapter;
import com.adapters.database.StroppingDatabase;
import com.classes.BaseItem;
import com.classes.Ingredient;
import com.classes.QuantityItem;
import com.classes.UOM;
import com.roughike.bottombar.BottomBar;
import com.roughike.bottombar.OnMenuTabClickListener;

import java.util.ArrayList;

public class MainActivity extends AppCompatActivity {

    static final int ADDNEW_RECIPE_REQUEST = 1;

    private BottomBar _bottombar;
    private MainFragmentPagerAdapter _pagerAdapter;
    private ViewPagerNoSwipe _pager;
    private Toolbar _mainToolbar;
    private FloatingActionButton _mainButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_main);

        _mainButton = (FloatingActionButton) findViewById(R.id.fab);

        SetupToolbar();

        SetupViewPager();

        SetupBottomBar(savedInstanceState);
        
        //SetupDatabase();
    }

    private void SetupToolbar()
    {
        _mainToolbar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(_mainToolbar);
        _mainToolbar.setTitle(R.string.Toolbar_ShoppingList);
    }

    private void SetupViewPager()
    {
        _pager = (ViewPagerNoSwipe) findViewById(R.id.pager);
        _pagerAdapter = new MainFragmentPagerAdapter(getSupportFragmentManager());
        _pager.setAdapter(_pagerAdapter);
        _pager.setOffscreenPageLimit(2);

        //Disables swipe navigation
        _pager.setPagingEnabled(false);
    }

    private void SetupBottomBar(Bundle savedInstanceState)
    {
        _bottombar = BottomBar.attach(this, savedInstanceState);
        //_bottombar.setMaxFixedTabs(2);
        _bottombar.setItems(R.menu.bottombar_menu);

        _bottombar.setOnMenuTabClickListener(new OnMenuTabClickListener() {
            @Override
            public void onMenuTabSelected(@IdRes int menuItemId) {
                switch (menuItemId){
                    case R.id.bottomBarItemOne:
                        _pager.setCurrentItem(0);
                        _mainToolbar.setTitle(R.string.Toolbar_ShoppingList);
                        SetMainButtonIcon(0);
                        RefreshShoppingList();
                        break;
                    case R.id.bottomBarItemTwo:
                        _pager.setCurrentItem(1);
                        _mainToolbar.setTitle(R.string.Toolbar_Ingredients);
                        SetMainButtonIcon(1);
                        break;
                    case R.id.bottomBarItemThree:
                        _pager.setCurrentItem(2);
                        _mainToolbar.setTitle(R.string.Toolbar_Recipes);
                        SetMainButtonIcon(2);
                        break;
                }
            }

            @Override
            public void onMenuTabReSelected(@IdRes int menuItemId) {

            }
        });
    }
    
    public void mainFABClick(View view)
    {
        Fragment currentFragment = (Fragment) _pagerAdapter.GetFragmentByIndex(_pager.getCurrentItem());
        if (currentFragment != null)
        {
          if (currentFragment instanceof ShoppingListFragment){
              addShoppingListItem_Click(1);
          }
            else if (currentFragment instanceof IngredientsListFragment){
              addIngredients_Click((IngredientsListFragment) currentFragment);
          }
            else if (currentFragment instanceof RecipesFragment){
              Intent intent = new Intent(this, RecipeEditActivity.class);
              intent.putExtra("requestCode", ADDNEW_RECIPE_REQUEST);
              startActivityForResult(intent, ADDNEW_RECIPE_REQUEST);
          }
        }
    }

    private void SetMainButtonIcon(int button)
    {
        // Shopping list or recipes
        if (button == 0 || button == 2){
            _mainButton.setImageResource(R.drawable.ic_add_white_24dp);
        }
        else{
            IngredientsListFragment ingredientsListFragment = (IngredientsListFragment) _pagerAdapter.GetFragmentByIndex(1);
            if (ingredientsListFragment._ingredientsAdatper._selectedIngredientsList.size() > 0){
                _mainButton.setImageResource(R.drawable.ic_playlist_add_white_24dp);
            }
        }

    }

    private void addShoppingListItem_Click(int button) {
        //IngredientsListFragment ingredientsListFragment = (IngredientsListFragment) _pagerAdapter.GetFragmentByIndex(1);
        SelectBottombarTab(button);
    }

    private void addIngredients_Click(IngredientsListFragment ingredientsFrag) {
        int tabToSelect = ingredientsFrag.addSelectedIngredientsToShoppingList();
        SelectBottombarTab(tabToSelect);
    }

    private void SelectBottombarTab(int button)
    {
        _bottombar.selectTabAtPosition(button, true);
    }

    @Override
    public void onResume() {
        super.onResume();  // Always call the superclass method first

        RefreshShoppingList();
        RefreshIngedientsList();
        RefreshRecipes();
    }

    private void RefreshShoppingList() {
        ShoppingListFragment shoppingListFragment = (ShoppingListFragment) _pagerAdapter.GetFragmentByIndex(0);
        // Reload all shoppingList item from database to see changes
        if (shoppingListFragment != null){
            IngredientListAdapter shoppingListAdapter = shoppingListFragment._shoppingListAdapter;
            shoppingListAdapter.updateAdapterFromDatabase(this);
        }
    }

    private void RefreshIngedientsList() {
        IngredientsListFragment ingredientsListFragment = (IngredientsListFragment) _pagerAdapter.GetFragmentByIndex(1);

        if (ingredientsListFragment != null){
            IngredientListAdapter ingredientsListAdapter = ingredientsListFragment._ingredientsAdatper;
            ingredientsListAdapter.updateAdapterFromDatabase(this);
        }
    }
    
    private void RefreshRecipes() {
        RecipesFragment recipesFragment = (RecipesFragment) _pagerAdapter.GetFragmentByIndex(2);

        // Reload all recipes from database to see changes
        if (recipesFragment != null){
            RecipeListAdapter recipeListAdapter = recipesFragment._recipeListAdapter;
            recipeListAdapter.updateAdapterFromDatabase(this);
        }
    }
    
        private void SetupDatabase()
    {
        StroppingDatabase db = new StroppingDatabase(this);
        db.open();

        db.ResetAllTables();

        db = new StroppingDatabase(this);
        db.open();
        
        UOM uomNumberof = db.createUOM("number of", "x");
        UOM uomGrams = db.createUOM("grams", "g");
        db.createUOM("kilograms", "kg");
        db.createUOM("liters", "l");
        db.createUOM("milliliters", "ml");
        db.createUOM("pints", "pts");

        BaseItem cat = db.createCategory("Misc");
        db.createCategory("Vegetable");
        db.createCategory("Fruit");
        db.createCategory("Poultry");
        db.createCategory("Red Meat");
        db.createCategory("Dairy");
        db.createCategory("Bakery");
        db.createCategory("Tinned Goods");
        db.createCategory("Store Cupboard");

        ArrayList<QuantityItem> ingredientArrayList = new ArrayList<>();

        Ingredient i_RedPepper = db.createIngredient("Red Pepper", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_Garlic = db.createIngredient("Garlic", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_RedOnion = db.createIngredient("Red Onion", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_Parsley = db.createIngredient("Parsley", uomGrams.getId(), 10, 10, 0, 0, 0, 0, cat.getId());
        Ingredient i_SmallTomato = db.createIngredient("Small Tomato", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_SaladOnions = db.createIngredient("Salad Onions", uomNumberof.getId(), 6, 6, 0, 0, 0, 0, cat.getId());
        Ingredient i_BrownRice = db.createIngredient("Brown Rice", uomGrams.getId(), 500, 500, 0, 0, 0, 0, cat.getId());
        Ingredient i_ChickenSC = db.createIngredient("Chicken Stock cube", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_Sausages = db.createIngredient("Turkey Sausages", uomNumberof.getId(), 8, 8, 0, 0, 0, 0, cat.getId());

        ingredientArrayList.add(i_RedPepper);
        ingredientArrayList.add(i_Garlic);
        ingredientArrayList.add(i_RedOnion);
        ingredientArrayList.add(i_Parsley);
        ingredientArrayList.add(i_SmallTomato);
        ingredientArrayList.add(i_SaladOnions);
        ingredientArrayList.add(i_BrownRice);
        ingredientArrayList.add(i_ChickenSC);
        ingredientArrayList.add(i_Sausages);
        db.createRecipe("Spicy Sausage Rice", 2, "", "", ingredientArrayList);
        
        ingredientArrayList.clear();
        
        Ingredient i_Onion = db.createIngredient("Onion", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_Mince = db.createIngredient("Turkey Mince", uomGrams.getId(), 500, 500, 0, 0, 0, 0, cat.getId());
        Ingredient i_ChoppedToms = db.createIngredient("Chopped Tomatoes", uomGrams.getId(), 250, 250, 0, 0, 0, 0, cat.getId());
        Ingredient i_Spag = db.createIngredient("Spag", uomGrams.getId(), 200, 200, 0, 0, 0, 0, cat.getId());
        Ingredient i_Carrot = db.createIngredient("Carrot", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_Celery = db.createIngredient("Celery", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        
        ingredientArrayList.add(i_RedPepper);
        i_Onion.setQuantity(2);
        ingredientArrayList.add(i_Onion);
        ingredientArrayList.add(i_Garlic);
        ingredientArrayList.add(i_Mince);
        i_ChoppedToms.setQuantity(500);
        ingredientArrayList.add(i_ChoppedToms);
        ingredientArrayList.add(i_Spag);
        ingredientArrayList.add(i_Carrot);
        ingredientArrayList.add(i_Celery);
        
        db.createRecipe("Spaghetti Bolognese", 2, "", "", ingredientArrayList);
        
        ingredientArrayList.clear();
        
        Ingredient i_BlackBeans = db.createIngredient("Black Beans", uomGrams.getId(), 200, 200, 0, 0, 0, 0, cat.getId());
        Ingredient i_GroundCumin = db.createIngredient("Ground Cumin", uomGrams.getId(), 10, 10, 0, 0, 0, 0, cat.getId());
        Ingredient i_GroundCinnamon = db.createIngredient("Ground Cinnamon", uomGrams.getId(), 10, 10, 0, 0, 0, 0, cat.getId());
        Ingredient i_ChipotlePaste = db.createIngredient("Chipotle Paste", uomGrams.getId(), 50, 50, 0, 0, 0, 0, cat.getId());
        Ingredient i_CherryToms = db.createIngredient("Cherry Tomatoes", uomNumberof.getId(), 30, 30, 0, 0, 0, 0, cat.getId());
        Ingredient i_RedChilli = db.createIngredient("Red Chilli", uomNumberof.getId(), 2, 2, 0, 0, 0, 0, cat.getId());
        Ingredient i_Apple = db.createIngredient("Apple", uomNumberof.getId(), 6, 6, 0, 0, 0, 0, cat.getId());
        Ingredient i_GemLettuce = db.createIngredient("Gem Lettuce", uomNumberof.getId(), 1, 1, 0, 0, 0, 0, cat.getId());
        Ingredient i_Raddish = db.createIngredient("Raddishes", uomNumberof.getId(), 20, 20, 0, 0, 0, 0, cat.getId());
        Ingredient i_SourCream = db.createIngredient("Sour Cream", uomGrams.getId(), 50, 50, 0, 0, 0, 0, cat.getId());
        
        i_Garlic.setQuantity(2);
        ingredientArrayList.add(i_Garlic);
        ingredientArrayList.add(i_BlackBeans);
        ingredientArrayList.add(i_GroundCumin);
        ingredientArrayList.add(i_GroundCinnamon);
        ingredientArrayList.add(i_ChipotlePaste);
        ingredientArrayList.add(i_CherryToms);
        ingredientArrayList.add(i_RedChilli);
        ingredientArrayList.add(i_Parsley);

        i_Apple.setQuantity(1);
        ingredientArrayList.add(i_Apple);
        ingredientArrayList.add(i_GemLettuce);
        i_Raddish.setQuantity(4);
        ingredientArrayList.add(i_Raddish);
        ingredientArrayList.add(i_SourCream);
        
        db.createRecipe("Veggie Fajitas", 2, "", "", ingredientArrayList);

        db.close();
    }

    // DEFAULT 'MY FIRST APP' CODE
    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        // Inflate the menu; this adds items to the action bar if it is present.
        getMenuInflater().inflate(R.menu.menu_main, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        // Handle action bar item clicks here. The action bar will
        // automatically handle clicks on the Home/Up button, so long
        // as you specify a parent activity in AndroidManifest.xml.
        int id = item.getItemId();

        //noinspection SimplifiableIfStatement
        if (id == R.id.action_resetdb) {
            SetupDatabase();
            onResume();
            return true;
        }

        return super.onOptionsItemSelected(item);
    }
}
