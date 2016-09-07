package com.oz10.stropping;

import android.content.Intent;
import android.os.Bundle;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ListView;

import com.adapters.IngredientListAdapter;
import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;
import com.classes.QuantityItem;
import com.classes.Recipe;

import java.util.ArrayList;

/**
 * Created by Austen on 09/08/2016.
 */
public class RecipeEditActivity extends AppCompatActivity {

    private EditText _recipeName;
    private Recipe _recipe;
    private IngredientListAdapter _ingredientArrayAdapter;

    private ArrayList<Ingredient> _ingredientsList;

    ActionBar actionBar;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_recipe_edit);

        SetupActionbar();

        //TODO Set image
        _recipeName = (EditText)findViewById(R.id.recipe_name);

        //TODO  This section needs to be refactored. When a recipe is being loaded
        //      the ingredients should be added to the adapter not a new list
        ListView ingredientListView = (ListView)findViewById(R.id.recipe_ingredientslistView);
        _ingredientsList = new ArrayList();
        _ingredientArrayAdapter = new IngredientListAdapter(this, _ingredientsList, R.layout.item_recipe_ingredient);
        ingredientListView.setAdapter(_ingredientArrayAdapter);

        Intent intent = getIntent();
        if (intent.getIntExtra("requestCode", 2) == 2){

            long recipeId = intent.getLongExtra("RecipeId", 0);

            StroppingDatabase stroppingDatabase = new StroppingDatabase(this);
            stroppingDatabase.open();

            _recipe = stroppingDatabase.getRecipeById(recipeId);

            if (_recipe != null){
                // Load recipe details
                _recipeName.setText(_recipe.getName());

                _ingredientsList = stroppingDatabase.getRecipeIngredientsById(recipeId);
                _ingredientArrayAdapter = new IngredientListAdapter(this, _ingredientsList, R.layout.item_recipe_ingredient);
                ingredientListView.setAdapter(_ingredientArrayAdapter);
            }

            stroppingDatabase.close();

        }else{
            // New recipe
            _recipe = new Recipe();
        }
    }

    private void SetupActionbar()
    {
        ActionBar actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (resultCode == RESULT_OK){
            ArrayList<Long> ingredientIds = (ArrayList<Long>) data.getSerializableExtra("IngredientIds");

            StroppingDatabase db = new StroppingDatabase(this);
            db.open();

            for (Long id:ingredientIds
                 ) {
                    _ingredientArrayAdapter.add(db.getIngredientFromId(id));
            }

            _ingredientArrayAdapter.notifyDataSetChanged();

            db.close();
        }
    }

    public void EditRecipeFABClick(View view)
    {
        Intent intent = new Intent(this, IngredientsAddActivity.class);
        startActivityForResult(intent, 1);

    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.menu_ok_only, menu);
        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item){
        //TODO Refactor
        if (item.getItemId() == android.R.id.home){
            finish();
            return true;
        }
        else if (item.getItemId() == R.id.action_menu_ok){
            // METHOD: Check if recipe has an id:
            //      Yes: Recipe might have been updated. Push updates to the database
            //      No : Create new recipe and push to database

            StroppingDatabase db = new StroppingDatabase(this);
            db.open();

            if (_recipe.getId() == 0){
                // new recipe
                //TODO Need to include properties serves & notes
                _recipe = db.createRecipe(_recipeName.getText().toString(), 0, "");
                db.addIngredientsToRecipe(_recipe.getId(), _ingredientArrayAdapter._ingredientsList); // getIngredientsFromAdapter(_ingredientArrayAdapter));
            }else{
                db.updateRecipe(_recipe.getId(),_recipeName.getText().toString(), _recipe.getServes(), _recipe.getNotes(), _ingredientArrayAdapter._ingredientsList); // getIngredientsFromAdapter(_ingredientArrayAdapter));
            }

            finish();

            db.close();
        }

        return true;
    }

    private ArrayList<QuantityItem> getIngredientsFromAdapter(IngredientListAdapter ingredientsAdapter)
    {
        ArrayList<QuantityItem> ingredients = new ArrayList<>();

        if (ingredientsAdapter != null){
            for (int i = 0; i < ingredientsAdapter.getCount(); i++){
                ingredients.add(ingredientsAdapter.getItem(i));
            }
        }

        return ingredients;
    }
}