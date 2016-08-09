package com.oz10.stropping;

import android.app.ListActivity;
import android.content.Intent;
import android.os.Bundle;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListAdapter;
import android.widget.ListView;
import android.widget.TextView;

import com.classes.Ingredient;
import com.classes.Recipe;

import java.util.ArrayList;

/**
 * Created by Austen on 09/08/2016.
 */
public class RecipeEditActivity extends AppCompatActivity {

    private EditText _recipeName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_recipe_edit);

        //TODO Set image
        _recipeName = (EditText)findViewById(R.id.recipe_name);
        ListView ingredientListView = (ListView)findViewById(R.id.recipe_ingredientslistView);
        ArrayList<String> ingredientsList = new ArrayList();

        Intent intent = getIntent();
        if (intent.getIntExtra("requestCode", 1) == 2){
            // Load recipe details
            _recipeName.setText(intent.getStringExtra("RecipeName"));
            ingredientsList = intent.getStringArrayListExtra("RecipeIngredients");
            ArrayAdapter<String> arrayAdapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, ingredientsList);
            ingredientListView.setAdapter(arrayAdapter);

        }else{
            // New recipe
        }


    }

    public void EditRecipeFABClick(View view)
    {
        //Recipe recipe = new Recipe((String)_recipeName.getText());
        Intent returnIntent = new Intent();

        String recipeName = _recipeName.getText().toString();

        returnIntent.putExtra("RecipeName", recipeName);
        setResult(RESULT_OK, returnIntent);
        finish();
    }
}