package com.oz10.stropping;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.support.v4.content.FileProvider;
import android.support.v4.view.ViewCompat;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.ListView;

import com.adapters.IngredientListAdapter;
import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;
import com.classes.QuantityItem;
import com.classes.Recipe;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;

/**
 * Created by Austen on 09/08/2016.
 */
public class RecipeEditActivity extends AppCompatActivity {

    private EditText _recipeName;
    private Recipe _recipe;
    private ImageView _recipeImage;
    private IngredientListAdapter _ingredientArrayAdapter;

    private ArrayList<Ingredient> _ingredientsList;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_recipe_edit_new2);

        //TODO Set image
        _recipeName = (EditText)findViewById(R.id.recipe_name);

        //TODO  This section needs to be refactored. When a recipe is being loaded
        //      the ingredients should be added to the adapter not a new list
        ListView ingredientListView = (ListView)findViewById(R.id.recipe_ingredientslistView);
        ViewCompat.setNestedScrollingEnabled(ingredientListView,true);

        _ingredientsList = new ArrayList();
        _ingredientArrayAdapter = new IngredientListAdapter(this, _ingredientsList, R.layout.item_recipe_ingredient);
        ingredientListView.setAdapter(_ingredientArrayAdapter);
        ingredientListView.setEmptyView(findViewById(android.R.id.empty));

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

        _recipeImage = (ImageView) findViewById(R.id.recipe_imageView);

        if (!_recipe.getRecipeImage().equals("")){
            _recipeImage.setImageURI(Uri.parse(_recipe.getRecipeImage()));
        }

        _recipeImage.setOnClickListener(new OnClickListener() {
            @Override
            public void onClick(View view) {
                Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                // Ensure that there's a camera activity to handle the intent
                if (takePictureIntent.resolveActivity(getPackageManager()) != null) {
                    startActivityForResult(takePictureIntent, 2);
//                    }
                }
            }
        });


        SetupActionbar();
    }

    private void SetupActionbar()
    {
        ActionBar actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (resultCode == RESULT_OK){
            switch (requestCode){
                case 1:
                    ArrayList<Long> ingredientIds = (ArrayList<Long>) data.getSerializableExtra("IngredientIds");

                    StroppingDatabase db = StroppingDatabase.getInstance(this);

                    for (Long id:ingredientIds
                            ) {
                        _ingredientArrayAdapter.add(db.getIngredientFromId(id), true);
                    }

                    _ingredientArrayAdapter.notifyDataSetChanged();
                    break;
                case 2:
                    // Get the thumbnail bitmap from the return intent
                    Bundle extras = data.getExtras();
                    Bitmap imageBitmap = (Bitmap) extras.get("data");

                    // Save the image
                    String imageName = saveImage(imageBitmap, _recipe.getName(), "jpg");

                    if (!imageName.equals("")){
                        _recipe.setRecipeImage(imageName);
                        _recipeImage.setImageBitmap(imageBitmap);
                    }

                    break;
            }
        }
    }

    public String saveImage(Bitmap b, String name, String extension){
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);

        name=name+"."+extension;

        File f = new File(storageDir, name);

        try {
            FileOutputStream out = new FileOutputStream(f);
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            out.flush();
            out.close();

            return f.getAbsolutePath();

        } catch (Exception e) {
            e.printStackTrace();
            return "";
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
        inflater.inflate(R.menu.menu_ok_delete, menu);
        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item){
        //TODO Refactor

        StroppingDatabase db;

        switch (item.getItemId()) {
            case android.R.id.home:
                finish();
                break;

            case R.id.action_menu_delete:
                db = StroppingDatabase.getInstance(this);

                if (_recipe.getId() != 0) {
                    db.deleteRecipe(_recipe);
                }

                finish();

                break;

            case R.id.action_menu_ok:
                // METHOD: Check if recipe has an id:
                //      Yes: Recipe might have been updated. Push updates to the database
                //      No : Create new recipe and push to database

                db = StroppingDatabase.getInstance(this);

                if (_recipe.getId() == 0){
                    // new recipe
                    //TODO Need to include properties serves & notes
                    _recipe = db.createRecipe(_recipeName.getText().toString(), 0, "", "");
                    db.addIngredientsToRecipe(_recipe.getId(), _ingredientArrayAdapter._ingredientsList); // getIngredientsFromAdapter(_ingredientArrayAdapter));
                }else{
                    db.updateRecipe(_recipe.getId(),_recipeName.getText().toString(), _recipe.getServes(), _recipe.getNotes(), _recipe.getRecipeImage(), _ingredientArrayAdapter._ingredientsList); // getIngredientsFromAdapter(_ingredientArrayAdapter));
                }

                finish();

                break;
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